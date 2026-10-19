'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { INFO_CLOSE_DELAY_MS, INFO_CLOSED, INFO_OPEN_DELAY_MS, infoReducer } from '@/core/info-popover';

/**
 * Подробности скилла: наведение на 400 мс открывает, уход на 150 мс закрывает (если не закреплено),
 * ⓘ / клавиша i закрепляет, Esc и клик вне закрывают.
 */
export function useSkillInfo() {
  const [state, dispatch] = useReducer(infoReducer, INFO_CLOSED);
  const rects = useRef(new Map<string, DOMRect>());
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = (t: typeof openTimer) => {
    if (t.current) clearTimeout(t.current);
    t.current = null;
  };

  const enter = useCallback((id: string, el: HTMLElement) => {
    clear(closeTimer);
    clear(openTimer);
    openTimer.current = setTimeout(() => {
      rects.current.set(id, el.getBoundingClientRect());
      dispatch({ type: 'open', id });
    }, INFO_OPEN_DELAY_MS);
  }, []);

  const leave = useCallback(() => {
    clear(openTimer);
    clear(closeTimer);
    closeTimer.current = setTimeout(() => dispatch({ type: 'close' }), INFO_CLOSE_DELAY_MS);
  }, []);

  const pin = useCallback((id: string, el: HTMLElement) => {
    clear(openTimer);
    clear(closeTimer);
    rects.current.set(id, el.getBoundingClientRect());
    dispatch({ type: 'pin', id });
  }, []);

  const dismiss = useCallback(() => {
    clear(openTimer);
    clear(closeTimer);
    dispatch({ type: 'dismiss' });
  }, []);

  /** Клик по карточке — это выбор, а не просмотр: незакреплённые подробности не открываем. */
  const cancel = useCallback(() => {
    clear(openTimer);
    clear(closeTimer);
    dispatch({ type: 'close' });
  }, []);

  /** Курсор над самим поповером — не закрывать. */
  const hold = useCallback(() => clear(closeTimer), []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open, dismiss]);

  useEffect(
    () => () => {
      clear(openTimer);
      clear(closeTimer);
    },
    [],
  );

  return {
    open: state.open,
    pinned: state.pinned,
    rect: state.open ? (rects.current.get(state.open) ?? null) : null,
    enter,
    leave,
    pin,
    dismiss,
    cancel,
    hold,
  };
}
