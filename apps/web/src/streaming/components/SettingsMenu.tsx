import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStreamStatus } from "../../queries/stream";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const playbackMode = useSettingsStore((s) => s.playbackMode);
  const setPlaybackMode = useSettingsStore((s) => s.setPlaybackMode);
  const { data: status } = useStreamStatus();
  const available = status?.available === true;
  const torrentOn = playbackMode === "torrent";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="dm-settings" ref={ref}>
      <button
        type="button"
        className="dm-nav__icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>
      {open && (
        <div className="dm-settings__popover">
          <div className="dm-settings__row">
            <div className="dm-settings__label">
              <span>Torrent streaming</span>
              <small>
                {available
                  ? "Stream via Jackett + TorrServer"
                  : "Jackett/TorrServer not reachable"}
              </small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={torrentOn}
              disabled={!available}
              className={
                "dm-switch" +
                (torrentOn ? " on" : "") +
                (available ? "" : " disabled")
              }
              onClick={() => setPlaybackMode(torrentOn ? "vidcore" : "torrent")}
            >
              <span className="dm-switch__thumb" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
