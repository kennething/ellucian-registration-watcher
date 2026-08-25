import axios, { AxiosInstance, AxiosResponse } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import ENV from "../../env";

class InternalClient {
  requestClient: AxiosInstance;
  protected currentTask: Promise<void | any>;
  queueLength = 0;

  constructor() {
    this.currentTask = Promise.resolve();

    const jar = new CookieJar();
    this.requestClient = wrapper(axios.create({ jar }));
    this.enqueue(this.setup.bind(this));
  }

  enqueue<T>(task: (client: AxiosInstance) => Promise<T> | T): Promise<T> {
    this.queueLength++;
    const taskCompletion = this.currentTask.then(() => task(this.requestClient));
    this.currentTask = taskCompletion.catch(() => {}).finally(() => this.queueLength--);

    return taskCompletion;
  }

  async refreshCookie() {
    const jar = new CookieJar();
    this.requestClient = wrapper(axios.create({ jar }));
    this.enqueue(this.setup.bind(this));
  }

  /** Makes the other required requests to enable the session ID to get classes
   * @returns whether all requests were successful
   */
  private async setup(): Promise<boolean> {
    console.log(`${new Date().toLocaleString()}: refreshing cookie`);
    const terms = (await this.requestClient.get<{ code: string; description: string }[]>(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=2`)).data;
    ClientManager.setRecentTerms(terms.map((term) => term.code) as [string, string]);

    const subjects = (
      await this.requestClient.get<{ code: string; description: string }[]>(
        `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_subject?searchTerm=&term=${terms[0].code}&offset=1&max=500`
      )
    ).data;
    ClientManager.subjects = subjects.map((subject) => ({ code: subject.code, name: subject.description }));

    const attributes = (
      await this.requestClient.get<{ code: string; description: string }[]>(
        `${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/classSearch/get_attribute?searchTerm=&term=${terms[0].code}&offset=1&max=50`
      )
    ).data;
    ClientManager.attributes = attributes.map((attribute) => ({ code: attribute.code, name: attribute.description }));

    const formData = new FormData();
    formData.append("term", terms[0].code);
    formData.append("studyPath", "");
    formData.append("studyPathText", "");
    formData.append("startDatepicker", "");
    formData.append("endDatepicker", "");
    await this.requestClient.post(`${ENV.BANNER_API_URL}/StudentRegistrationSsb/ssb/term/search?mode=search`, formData);

    return true;
  }
}

class Client extends InternalClient {
  id: symbol;
  private deleteId: symbol;
  private deleteTimer: NodeJS.Timeout;

  constructor() {
    super();

    this.id = Symbol();

    const deleteId = Symbol();
    this.deleteId = deleteId;
    this.deleteTimer = setTimeout(() => {
      if (this.deleteId === deleteId) ClientManager.flushExternalClient(this.id);
    }, ENV.CLIENT_LIFETIME * 1000);
  }

  override enqueue<T>(task: (client: AxiosInstance) => Promise<T> | T): Promise<T> {
    this.queueLength++;
    const taskCompletion = this.currentTask.then(() => {
      clearTimeout(this.deleteTimer);

      const deleteId = Symbol();
      this.deleteId = deleteId;
      this.deleteTimer = setTimeout(() => {
        if (this.deleteId === deleteId) ClientManager.flushExternalClient(this.id);
      }, ENV.CLIENT_LIFETIME * 1000);

      return task(this.requestClient);
    });
    this.currentTask = taskCompletion.catch(() => {}).finally(() => this.queueLength--);

    return taskCompletion;
  }
}

export class ClientManager {
  private static clients = {
    internal: new InternalClient(),
    external: [] as Client[]
  };

  private static mostRecentTerms: [latest: string, secondLatest: string] | null = null;
  static subjects: { code: string; name: string }[] | null = null;
  static attributes: { code: string; name: string }[] | null = null;

  static requestInternalClient<T extends AxiosResponse>(request: (client: AxiosInstance) => Promise<T>): Promise<T> {
    return ClientManager.clients.internal.enqueue(request);
  }

  static requestExternalClient<T extends AxiosResponse>(request: (client: AxiosInstance) => Promise<T>): [Promise<T>, symbol] {
    const freeClient = ClientManager.clients.external.find((client) => client.queueLength === 0);
    if (freeClient) return [freeClient.enqueue(request), freeClient.id];

    if (ClientManager.clients.external.length < ENV.MAX_REQUEST_CLIENTS) {
      const newClient = new Client();
      ClientManager.clients.external.push(newClient);
      return [newClient.enqueue(request), newClient.id];
    }

    const shortestQueueClient = ClientManager.clients.external.reduce((prev, curr) => (prev.queueLength < curr.queueLength ? prev : curr));
    return [shortestQueueClient.enqueue(request), shortestQueueClient.id];
  }
  static async refreshExternalClient(id: symbol): Promise<void> {
    const client = ClientManager.clients.external.find((client) => client.id === id);
    if (client) client.refreshCookie();
  }
  static flushExternalClient(id: symbol): void {
    ClientManager.clients.external = ClientManager.clients.external.filter((client) => client.id !== id);
  }

  static getMostRecentTerms(): [offSemester: string, realSemester: string] | [latest: string] | null {
    if (!ClientManager.mostRecentTerms) return null;

    const latestTerm = ClientManager.mostRecentTerms[0];
    // winter, summer term
    if (["10", "60"].includes(latestTerm.slice(-2))) return ClientManager.mostRecentTerms;
    else return [ClientManager.mostRecentTerms[0]];
  }

  static setRecentTerms(terms: [latest: string, secondLatest: string]) {
    ClientManager.mostRecentTerms = terms;
  }
}
