export default function BrandLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ziemowit-drop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3c9bd6" />
          <stop offset="1" stopColor="#1f7a52" />
        </linearGradient>
      </defs>
      <path d="M32 4C32 4 11 27.5 11 41a21 21 0 0 0 42 0C53 27.5 32 4 32 4Z" fill="url(#ziemowit-drop)" />
      <path d="M32 52V35" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M32 40c-7.5 0-11.5-4.2-11.5-10.5 7.5 0 11.5 4.2 11.5 10.5Z" fill="#fff" />
      <path d="M32 36c0-7.5 4.2-11.5 11-11.5 0 7.3-4 11.5-11 11.5Z" fill="#fff" opacity=".85" />
    </svg>
  );
}
