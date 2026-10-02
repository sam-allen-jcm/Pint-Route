import { useState } from "react";

interface Props {
  name: string;
  slug: string;
  editToken: string | null;
  onClose: () => void;
}

export function ShareSheet({ name, slug, editToken, onClose }: Props) {
  const [copied, setCopied] = useState<"view" | "edit" | null>(null);
  const viewUrl = `${location.origin}/c/${slug}`;
  const editUrl = editToken ? `${viewUrl}#edit=${editToken}` : null;

  async function copy(text: string, which: "view" | "edit") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      window.prompt("Copy this link:", text);
    }
  }

  async function shareView() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} · Pint Route`, text: `Join the crawl: ${name}`, url: viewUrl });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    copy(viewUrl, "view");
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Share crawl" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <h2>Share this crawl</h2>

        <div className="share-option">
          <h3>Read-only link</h3>
          <p className="muted small">Anyone with this link can follow along, but can't change anything.</p>
          <div className="link-box">{viewUrl}</div>
          <button className="btn btn-primary btn-block" onClick={shareView}>
            {copied === "view" ? "Link copied ✓" : "Share link"}
          </button>
        </div>

        {editUrl && (
          <div className="share-option private">
            <h3>🔒 Private edit link</h3>
            <p className="muted small">
              Opens this crawl with editing on another phone. Keep it to yourself: anyone with it can edit.
            </p>
            <button className="btn btn-ghost btn-block" onClick={() => copy(editUrl, "edit")}>
              {copied === "edit" ? "Edit link copied ✓" : "Copy private edit link"}
            </button>
          </div>
        )}

        <button className="btn btn-plain btn-block" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
