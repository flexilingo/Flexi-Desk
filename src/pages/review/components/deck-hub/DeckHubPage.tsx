import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Image, Layers } from 'lucide-react';

export function DeckHubPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/review')}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Deck Hub</h1>
          <p className="text-sm text-muted-foreground">Convert any content into a study deck</p>
        </div>
      </div>

      {/* Entry cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          onClick={() => navigate('/review/deck-hub/text')}
          className="group text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <h2 className="font-semibold text-foreground">Text → Deck</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste any text — article, lyrics, transcript — and AI extracts vocabulary, phrases, and grammar patterns.
          </p>
        </button>

        <button
          onClick={() => navigate('/review/deck-hub/image')}
          className="group text-left bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-[#8BB7A3]/10 flex items-center justify-center mb-3 group-hover:bg-[#8BB7A3]/20 transition-colors">
            <Image className="w-5 h-5 text-[#8BB7A3]" />
          </div>
          <h2 className="font-semibold text-foreground">Image → Deck</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload a photo of text — book page, whiteboard, screenshot — OCR extracts the text, then AI analyzes it.
          </p>
        </button>
      </div>

      {/* Tip */}
      <div className="flex items-start gap-2.5 bg-muted/50 rounded-lg px-4 py-3">
        <Layers className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          After creating a deck, open it to export as Anki (.apkg), CSV, Quizlet (TSV), or sync to the FlexiLingo cloud.
        </p>
      </div>
    </div>
  );
}
