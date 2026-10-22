import { useNavigate } from 'react-router-dom';
import { FileText, Image, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageBack } from '../parts/PageBack';

export function DeckHubPage() {
  const { t } = useTranslation('decks');
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageBack to="/review" label={t('backToDecks')} />
      <div>
        <h1 className="text-xl font-bold text-foreground">{t('deckHub')}</h1>
        <p className="text-sm text-muted-foreground">{t('hub.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          onClick={() => navigate('/review/deck-hub/text')}
          className="group rounded-xl border border-border bg-card p-5 text-start transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">{t('hub.textTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('hub.textDesc')}</p>
        </button>

        <button
          onClick={() => navigate('/review/deck-hub/image')}
          className="group rounded-xl border border-border bg-card p-5 text-start transition-all hover:border-primary/40 hover:shadow-md"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 transition-colors group-hover:bg-success/20">
            <Image className="h-5 w-5 text-success" />
          </div>
          <h2 className="font-semibold text-foreground">{t('hub.imageTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('hub.imageDesc')}</p>
        </button>
      </div>

      <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 px-4 py-3">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{t('hub.tip')}</p>
      </div>
    </div>
  );
}
