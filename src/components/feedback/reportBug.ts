/** Open-source contributors can still file an issue; learners never need GitHub. */
export const GITHUB_ISSUES_URL = 'https://github.com/flexilingo/Flexi-Desk/issues/new';

export type ReportType = 'bug' | 'feature' | 'other';
export const REPORT_TYPES: ReportType[] = ['bug', 'feature', 'other'];

// The server's own limits (submit-feedback): checked here too, so the learner sees
// what to fix before anything is sent.
const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 200;
const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ReportProblem = 'subject' | 'message' | 'email' | null;

/** What is wrong with the form, or null when it can be sent. */
export function reportProblem(input: {
  subject: string;
  message: string;
  email: string;
  signedIn: boolean;
}): ReportProblem {
  const subject = input.subject.trim();
  const message = input.message.trim();
  if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) return 'subject';
  if (message.length < MESSAGE_MIN || message.length > MESSAGE_MAX) return 'message';
  if (!input.signedIn && !EMAIL_RE.test(input.email.trim())) return 'email';
  return null;
}
