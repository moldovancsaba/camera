import { fffBrowser } from '@/lib/funfitfan/fff-browser-urls';

export default function ReelEmptyCTA() {
  return (
    <div className="app-btn-stack app-btn-stack--fff-reel-empty">
      <a href={fffBrowser.log} className="app-btn app-btn--primary">
        I DO IT
      </a>
      <a href={fffBrowser.history} className="app-btn app-btn--secondary">
        History
      </a>
    </div>
  );
}
