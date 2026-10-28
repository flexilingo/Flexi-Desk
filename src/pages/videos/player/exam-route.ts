/** An exam being sat (CELPIP, or TCF Canada / Québec / IRN): its clock runs, its buttons must stay reachable. */
export const isExamSession = (pathname: string): boolean =>
  /^\/(celpip|exam\/[^/]+)\/session\//.test(pathname);
