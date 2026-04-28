import { MobiusMark } from "./MobiusMark";

const columns: Array<{ heading: string; links: string[] }> = [
  { heading: "Watch", links: ["Series", "Films", "Live", "New & Trending"] },
  { heading: "Account", links: ["My List", "Profiles", "Devices", "Subscription"] },
  { heading: "Company", links: ["About", "Press", "Careers", "Help"] },
];

export function Footer() {
  return (
    <footer className="dm-footer">
      <div className="dm-footer__cols">
        <div>
          <div className="dm-footer__brand">
            <MobiusMark size={32} />
            <span className="dm-footer__wordmark">Møbius</span>
          </div>
          <p className="dm-footer__tagline">A loop you never leave.</p>
        </div>
        {columns.map((col) => (
          <div key={col.heading}>
            <h5>{col.heading}</h5>
            <ul>
              {col.links.map((l) => (
                <li key={l}>
                  <a>{l}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="dm-footer__legal">
        © 2026 Møbius · v1.0 · All artwork is placeholder.
      </div>
    </footer>
  );
}
