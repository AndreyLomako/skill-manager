// Состояние поповера подробностей скилла. Таймеры (задержки наведения) — в хуке UI,
// здесь только переходы: что происходит, когда таймер сработал или нажата кнопка.

/** Через сколько после наведения открывать и через сколько после ухода закрывать. */
export const INFO_OPEN_DELAY_MS = 400;
export const INFO_CLOSE_DELAY_MS = 150;

export interface InfoState {
  open: string | null;
  pinned: boolean;
}

export type InfoAction =
  | { type: 'open'; id: string } // наведение продержалось INFO_OPEN_DELAY_MS
  | { type: 'close' } // курсор ушёл на INFO_CLOSE_DELAY_MS
  | { type: 'pin'; id: string } // ⓘ или клавиша i
  | { type: 'dismiss' }; // Esc, клик вне, «×»

export const INFO_CLOSED: InfoState = { open: null, pinned: false };

export function infoReducer(state: InfoState, action: InfoAction): InfoState {
  switch (action.type) {
    case 'open':
      if (state.pinned) return state;
      return { open: action.id, pinned: false };
    case 'close':
      return state.pinned ? state : INFO_CLOSED;
    case 'pin':
      return state.pinned && state.open === action.id ? INFO_CLOSED : { open: action.id, pinned: true };
    case 'dismiss':
      return INFO_CLOSED;
  }
}
