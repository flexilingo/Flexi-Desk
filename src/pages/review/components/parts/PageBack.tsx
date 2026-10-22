import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageBack({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
      {label}
    </Link>
  );
}
