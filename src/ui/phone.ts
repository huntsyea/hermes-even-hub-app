import type { BridgeDefaults } from "../config";
import type { ConnectionProfile } from "../storage/persist";

interface PhoneSetupState {
  profile: ConnectionProfile | null;
  defaults: BridgeDefaults;
  status: string;
  errors: string[];
}

interface PhoneSetupActions {
  onSaveConnect: (url: string, token: string) => void;
  onDisconnect: () => void;
}

export function renderPhoneSetup(
  root: HTMLElement,
  state: PhoneSetupState,
  actions: PhoneSetupActions,
): void {
  const shell = el("main", "setup-shell");
  const panel = el("section", "setup-panel");
  const form = el("form", "setup-form");
  const url = input("url", "Bridge URL", state.profile?.url || state.defaults.url, "wss://node.tailnet.ts.net:8443");
  const token = input("password", "Bridge token", state.profile?.token || state.defaults.token, "Shared bridge token");
  const header = el("header", "setup-header");
  const status = el("p", `setup-status ${statusClass(state.status)}`, statusText(state.status));
  const title = el("h1", "", "Hermes");
  const intro = el("p", "setup-copy", "G2 bridge connection");
  const updated = state.profile?.updatedAt
    ? el("p", "setup-meta", `Last saved ${new Date(state.profile.updatedAt).toLocaleString()}`)
    : el("p", "setup-meta", "No saved bridge profile");
  const actionsRow = el("div", "setup-actions");
  const save = button("submit", "Save and connect");
  const disconnect = button("button", "Disconnect");
  disconnect.disabled = state.status === "not configured" || state.status === "disconnected";
  disconnect.addEventListener("click", actions.onDisconnect);
  actionsRow.append(save, disconnect);
  header.append(el("div", "setup-title", "", [title, intro]), status);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    actions.onSaveConnect(url.value, token.value);
  });

  form.append(label("Bridge URL", url), label("Token", token), actionsRow);
  panel.append(header, updated, errorList(state.errors), form, helpBlock());
  shell.append(panel);
  root.replaceChildren(shell);
}

function helpBlock(): HTMLElement {
  const block = document.createElement("details");
  block.className = "setup-help";
  const summary = el("summary", "setup-help-summary");
  const action = el("span", "setup-toggle-action", "Show");
  summary.append(el("span", "", "Setup details"), action);
  const body = el("div", "setup-help-body");
  body.append(
    el("p", "", "Expose the local bridge with Tailscale Serve, then enter the WSS URL and token above."),
    code("tailscale serve --https=8443 --bg http://localhost:8765"),
    code("wss://<node>.<tailnet>.ts.net:8443"),
  );
  block.addEventListener("toggle", () => {
    action.textContent = block.open ? "Hide" : "Show";
  });
  block.append(
    summary,
    body,
  );
  return block;
}

function errorList(errors: string[]): HTMLElement {
  const list = el("ul", "setup-errors");
  for (const error of errors) {
    const item = el("li", "", error);
    list.append(item);
  }
  list.hidden = errors.length === 0;
  return list;
}

function input(type: string, name: string, value: string, placeholder: string): HTMLInputElement {
  const element = document.createElement("input");
  element.type = type;
  element.name = name;
  element.value = value;
  element.placeholder = placeholder;
  element.autocomplete = "off";
  element.autocapitalize = "none";
  element.spellcheck = false;
  if (type === "url") element.inputMode = "url";
  return element;
}

function label(text: string, control: HTMLInputElement): HTMLLabelElement {
  const element = document.createElement("label");
  const span = el("span", "", text);
  element.append(span, control);
  return element;
}

function button(type: "button" | "submit", text: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = type;
  element.textContent = text;
  return element;
}

function code(text: string): HTMLElement {
  return el("code", "", text);
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
  children: HTMLElement[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  if (children.length) element.append(...children);
  return element;
}

function statusText(status: string): string {
  if (status === "connected") return "Connected";
  if (status === "not configured") return "Not configured";
  if (status === "disconnected") return "Disconnected";
  if (status === "reconnecting") return "Reconnecting";
  if (status === "error: bridge token rejected") return "Token rejected";
  if (status.startsWith("connecting")) return "Connecting";
  if (status.startsWith("error:")) return "Error";
  return status;
}

function statusClass(status: string): string {
  if (status === "connected") return "is-connected";
  if (status.startsWith("error:")) return "is-error";
  if (status === "not configured" || status === "disconnected") return "is-muted";
  return "is-pending";
}
