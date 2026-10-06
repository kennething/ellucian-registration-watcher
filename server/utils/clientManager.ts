import axios, { AxiosInstance, AxiosResponse } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { Term, TermId } from "./term";
import ENV from "../../env";
import { Log } from "./log";

class InternalClient {
  requestClient: AxiosInstance;
  protected currentTask: Promise<void | any>;
  protected term: Term;
  queueLength = 0;

  constructor(term: Term) {
    this.currentTask = Promise.resolve();
    this.term = term;

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
    Log.debug("InternalClient refresh cookie");
    const jar = new CookieJar();
    this.requestClient = wrapper(axios.create({ jar }));
    this.enqueue(this.setup.bind(this));
  }

  /** Makes the other required requests to enable the session ID to get classes
   * @returns whether all requests were successful
   */
  private async setup(): Promise<boolean> {
    Log.debug("client setup");

    const formData = new FormData();
    formData.append("term", this.term.termId);
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
  private deleteId: symbol | null = null;
  private deleteTimer: NodeJS.Timeout | null = null;

  constructor(term: Term) {
    super(term);
    this.id = Symbol();
  }

  override enqueue<T>(task: (client: AxiosInstance) => Promise<T> | T): Promise<T> {
    this.queueLength++;
    const taskCompletion = this.currentTask.then(() => {
      if (this.deleteTimer) clearTimeout(this.deleteTimer);

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
    /** used for requests made by internal events
     *
     * never actually null in practice
     */
    internal: null as InternalClient | null,
    /** used for user search requests, etc */
    external: {} as Record<TermId, Client[]>
  };

  static terms: Term[] = [];
  static subjects: { code: string; name: string }[] = [];
  static attributes: { code: string; name: string; isSpecial: boolean }[] = [];
  static locations: { short: string; long: string }[] = [];

  static setClients(internalTermId: TermId, externalTermIds: TermId[]): void {
    ClientManager.clients.internal = new InternalClient(new Term(internalTermId));
    for (const termId of externalTermIds) ClientManager.clients.external[termId] = [];
  }

  static requestInternalClient<T extends AxiosResponse>(request: (client: AxiosInstance) => Promise<T>): Promise<T> {
    Log.debug("internal client request");
    return ClientManager.clients.internal!.enqueue(request);
  }
  static async refreshInternalClient(): Promise<void> {
    ClientManager.clients.internal?.refreshCookie();
  }

  /** @returns a promise to await containing the request, and the client ID of the client used */
  static requestExternalClient<T extends AxiosResponse>(termId: string, request: (client: AxiosInstance) => Promise<T>): [Promise<T>, clientId: symbol] {
    const termIdCast = termId as TermId;

    const freeClient = ClientManager.clients.external[termIdCast]!.find((client) => client.queueLength <= ENV.NEW_REQUEST_CLIENT_THRESHOLD);
    Log.debug(termIdCast, "free client:", !!freeClient);
    if (freeClient) return [freeClient.enqueue(request), freeClient.id];

    if (ClientManager.clients.external[termIdCast]!.length < ENV.MAX_REQUEST_CLIENTS) {
      Log.debug(termIdCast, "creating new client");
      const newClient = new Client(new Term(termIdCast));
      ClientManager.clients.external[termIdCast]!.push(newClient);
      return [newClient.enqueue(request), newClient.id];
    }

    Log.debug(termIdCast, "waiting for client");
    const shortestQueueClient = ClientManager.clients.external[termIdCast]!.reduce((prev, curr) => (prev.queueLength < curr.queueLength ? prev : curr));
    return [shortestQueueClient.enqueue(request), shortestQueueClient.id];
  }
  static async refreshExternalClient(id: symbol): Promise<void> {
    const client = Object.values(ClientManager.clients.external)
      .flat()
      .find((client) => client.id === id);
    if (client) client.refreshCookie();
  }
  static flushExternalClient(id: symbol): void {
    const row = Object.entries(ClientManager.clients.external).find((row) => row[1].some((client) => client.id === id));
    if (!row) return;

    const termId = row[0] as TermId;
    ClientManager.clients.external[termId] = ClientManager.clients.external[termId].filter((client) => client.id !== id);
    Log.debug(`${termId} flushed external client`);
  }
}
