import { create } from 'zustand';

export interface DataNotice {
  id: string;
  pageNumber?: number;
  message: string;
}

interface NoticeState {
  notices: DataNotice[];
  add: (n: DataNotice) => void;
  dismiss: (id: string) => void;
}

/** Things the user should know happened to their data (repairs, restored copies). */
export const useDataNotices = create<NoticeState>((set) => ({
  notices: [],
  add: (n) =>
    set((s) => (s.notices.some((x) => x.id === n.id) ? s : { notices: [...s.notices, n] })),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}));
