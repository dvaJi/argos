import { WORDMARK_CLASS, WORDMARK_TEXT_CLASS } from "#/lib/pageMotion";

export function BrandWordmark({ topOffset = "top-[4%]" }: { topOffset?: string }) {
  return (
    <div aria-hidden="true" className={`${WORDMARK_CLASS} ${topOffset}`}>
      <span className={WORDMARK_TEXT_CLASS}>argos</span>
    </div>
  );
}
