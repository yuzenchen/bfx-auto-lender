import { BotStatus, Status, request } from "../api";

export interface AccountRow {
  index: number;
  name: string;
  ok: boolean;
  error?: string;
  status?: Status;
}

export const consoleApi = {
  getAccounts: () => request<AccountRow[]>("api/accounts"),
  renameAccount: (index: number, name: string) =>
    request<{ ok: boolean; name: string }>(`api/accounts/${index}/name`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  botAction: (index: number, action: "start" | "stop") =>
    request<BotStatus>(`api/accounts/${index}/bot/${action}`, { method: "POST" }),
};
