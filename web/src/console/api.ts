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
  botAction: (index: number, action: "start" | "stop") =>
    request<BotStatus>(`api/accounts/${index}/bot/${action}`, { method: "POST" }),
};
