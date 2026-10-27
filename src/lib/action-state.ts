export interface ActionState {
  ok: boolean;
  message?: string;
  error?: string;
}
export const idle: ActionState = { ok: false };
