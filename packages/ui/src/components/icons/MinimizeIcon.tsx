interface MinimizeIconProps {
  fill?: string;
}

export default function MinimizeIcon({ fill = "currentColor" }: MinimizeIconProps) {
  return (
    <svg width="10" height="1" viewBox="0 0 10 1" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M0.5 1C0.43 1 0.36 0.99 0.3 0.96C0.24 0.93 0.19 0.9 0.15 0.85C0.1 0.81 0.07 0.76 0.04 0.7C0.01 0.64 0 0.57 0 0.5C0 0.43 0.01 0.37 0.04 0.31C0.07 0.25 0.1 0.2 0.15 0.15C0.19 0.1 0.24 0.06 0.3 0.04C0.36 0.01 0.43 0 0.5 0H9.5C9.57 0 9.63 0.01 9.69 0.04C9.75 0.06 9.81 0.1 9.85 0.15C9.9 0.2 9.93 0.25 9.96 0.31C9.99 0.37 10 0.43 10 0.5C10 0.57 9.99 0.64 9.96 0.7C9.93 0.76 9.9 0.81 9.85 0.85C9.81 0.9 9.75 0.93 9.69 0.96C9.63 0.99 9.57 1 9.5 1H0.5Z"
        fill={fill}
      />
    </svg>
  );
}
