export default function Loading() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] opacity-100"
      aria-live="polite"
      aria-label="טוען"
    >
      <div className="h-1.5 bg-primary/15">
        <div className="global-loading-bar h-full w-1/2 rounded-full bg-primary shadow-[0_0_18px_var(--primary)]" />
      </div>
    </div>
  );
}
