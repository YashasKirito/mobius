import { useState } from "react";
import { ChevronDown, Play } from "lucide-react";
import { useNavigate } from "react-router";
import { useTvSeason } from "../../queries/catalog";
import {
  FALLBACK_BACKDROP,
  type TvEpisode,
  type TvSeasonSummary,
} from "../types";

type Props = {
  tvId: number;
  seasons: TvSeasonSummary[];
};

export function EpisodeList({ tvId, seasons }: Props) {
  const navigate = useNavigate();
  const initial = seasons[0]?.number ?? 1;
  const [seasonNumber, setSeasonNumber] = useState<number>(initial);
  const [open, setOpen] = useState(false);

  const { data, isPending } = useTvSeason(tvId, seasonNumber);
  const current = seasons.find((s) => s.number === seasonNumber) ?? seasons[0];

  const playEpisode = (episodeNumber: number) => {
    navigate(`/watch/tv/${tvId}?s=${seasonNumber}&e=${episodeNumber}`);
  };

  return (
    <section className="dm-episodes">
      <header className="dm-episodes__head">
        <h3 className="dm-episodes__title">Episodes</h3>
        {seasons.length > 1 ? (
          <div className="dm-episodes__season">
            <button
              type="button"
              className="dm-episodes__season-btn"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
            >
              {current?.name ?? `Season ${seasonNumber}`}
              <ChevronDown size={16} />
            </button>
            {open && (
              <ul className="dm-episodes__season-menu" role="listbox">
                {seasons.map((s) => (
                  <li key={s.number}>
                    <button
                      type="button"
                      className={`dm-episodes__season-item${s.number === seasonNumber ? " is-active" : ""}`}
                      onClick={() => {
                        setSeasonNumber(s.number);
                        setOpen(false);
                      }}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <span className="dm-episodes__season-static">
            {current?.name ?? `Season ${seasonNumber}`}
          </span>
        )}
      </header>

      {isPending ? (
        <div className="dm-episodes__loading">Loading episodes…</div>
      ) : (
        <ol className="dm-episodes__list">
          {(data?.episodes ?? []).map((ep) => (
            <EpisodeRow
              key={ep.number}
              episode={ep}
              onPlay={() => playEpisode(ep.number)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function EpisodeRow({
  episode,
  onPlay,
}: {
  episode: TvEpisode;
  onPlay: () => void;
}) {
  return (
    <li className="dm-episode" onClick={onPlay}>
      <div className="dm-episode__num">
        {String(episode.number).padStart(2, "0")}
      </div>
      <div className="dm-episode__art">
        <img
          src={episode.stillUrl ?? FALLBACK_BACKDROP}
          alt={episode.name}
          loading="lazy"
        />
        <div className="dm-episode__play" aria-hidden>
          <Play size={20} fill="currentColor" />
        </div>
      </div>
      <div className="dm-episode__body">
        <div className="dm-episode__title-row">
          <h4 className="dm-episode__title">{episode.name}</h4>
          {episode.runtime && (
            <span className="dm-episode__runtime">{episode.runtime}</span>
          )}
        </div>
        {episode.overview && (
          <p className="dm-episode__overview">{episode.overview}</p>
        )}
      </div>
    </li>
  );
}
