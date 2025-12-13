// Cloudflare Brand Icon
interface CloudflareIconProps {
  className?: string;
}

export function CloudflareIcon({ className }: CloudflareIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
    >
      {/* White background with rounded corners */}
      <rect width="64" height="64" rx="8" fill="white" />
      {/* Icon content centered with padding */}
      <g transform="translate(6, 1)">
        <defs>
          <linearGradient id="cloudflare-gradient" x1="118.18%" x2="10.8%" y1="-2.39%" y2="101.62%">
            <stop offset="0" stopColor="#fbb743" />
            <stop offset="1" stopColor="#f28333" />
          </linearGradient>
        </defs>
        <g fill="none">
          <path
            d="M41.94 8H56l2 2v44l-2 2H36.84l.97-1.5h17.57l1.12-1.12V10.62L55.38 9.5H43.26l-1.43 7.39H40.3l1.37-7.46.28-1.43zM8 56l-2-2V10l2-2h19.9l-1 1.5H8.62L7.5 10.62v42.76l1.12 1.12H23.1l-.24 1.5zm3-5h8.5l-.3 1.5H10l-.5-.5v-9l1.5 3zm34 0l1.5 1.5H39l1-1.5z"
            fill="#b7bbbd"
          />
          <path
            d="M28.67 38H15l-1.66-3.12 23-34 3.62 1.5L35.42 26H49l1.68 3.09-22 34-3.66-1.4zM11.5 15a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
            fill="url(#cloudflare-gradient)"
          />
        </g>
      </g>
    </svg>
  );
}
