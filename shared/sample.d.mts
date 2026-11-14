export type MailMessage = {
  id: string;
  from: string;
  subject: string;
  at: string;
  unread: boolean;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
};

export function seoulDay(now: Date): { ymd: string; start: string; end: string };
export function sampleMail(now: Date): MailMessage[];
export function sampleEvents(now: Date): CalendarEvent[];
