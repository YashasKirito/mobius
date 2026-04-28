import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bell, Search, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuthStore } from "../../stores/authStore";
import { MobiusMark } from "./MobiusMark";

const links = ["Home", "Series", "Films", "Live", "My List"] as const;

type Props = {
  active?: (typeof links)[number];
};

function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
    return (first + last).toUpperCase() || "M";
  }
  if (email) return email[0]?.toUpperCase() ?? "M";
  return "M";
}

export function TopNav({ active = "Home" }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQ = searchParams.get("q") ?? "";
  const [searchOpen, setSearchOpen] = useState(initialQ.length > 0);
  const [query, setQuery] = useState(initialQ);
  const inputRef = useRef<HTMLInputElement>(null);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const initials = initialsOf(user?.displayName, user?.email);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const handleAvatarClick = () => {
    if (window.confirm(`Sign out${user?.email ? ` of ${user.email}` : ""}?`)) {
      void signOut();
    }
  };

  const submitSearch = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const closeSearch = () => {
    setQuery("");
    setSearchOpen(false);
  };

  return (
    <nav className={"dm-nav" + (scrolled ? " scrolled" : "")}>
      <div className="dm-nav__brand">
        <MobiusMark size={36} />
        <span className="dm-nav__wordmark">Møbius</span>
      </div>
      <div className="dm-nav__links">
        {links.map((l) => (
          <button
            key={l}
            type="button"
            className={"dm-nav__link" + (l === active ? " active" : "")}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="dm-nav__spacer" />
      {searchOpen ? (
        <form className="dm-nav__search" onSubmit={submitSearch} role="search">
          <Search size={16} className="dm-nav__search-icon" />
          <input
            ref={inputRef}
            type="search"
            className="dm-nav__search-input"
            placeholder="Titles, people, genres"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeSearch();
            }}
            aria-label="Search"
          />
          <button
            type="button"
            className="dm-nav__icon-btn"
            onClick={closeSearch}
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="dm-nav__icon-btn"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
        >
          <Search size={20} />
        </button>
      )}
      <button
        type="button"
        className="dm-nav__icon-btn"
        aria-label="Notifications"
      >
        <Bell size={20} />
      </button>
      <button
        type="button"
        className="dm-nav__avatar"
        onClick={handleAvatarClick}
        aria-label={`Sign out${user?.email ? ` of ${user.email}` : ""}`}
        title={user?.email ?? "Sign out"}
        style={{ border: "none", padding: 0, cursor: "pointer" }}
      >
        {initials}
      </button>
    </nav>
  );
}
