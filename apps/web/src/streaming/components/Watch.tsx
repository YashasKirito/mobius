import { ArrowLeft } from "lucide-react";

type Props = {
  src: string;
  title: string;
  onClose: () => void;
};

export function Watch({ src, title, onClose }: Props) {
  return (
    <div className="dm-watch">
      <iframe
        className="dm-watch__frame"
        src={src}
        title={title}
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        allowFullScreen
        referrerPolicy="origin"
      />
      <button
        type="button"
        className="dm-watch__back"
        onClick={onClose}
        aria-label="Back"
      >
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>
    </div>
  );
}
