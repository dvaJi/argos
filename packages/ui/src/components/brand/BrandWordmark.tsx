import { WORDMARK_CLASS, WORDMARK_TEXT_CLASS } from "#/lib/pageMotion";

export function BrandWordmark() {
  return (
    <div aria-hidden="true" className={`${WORDMARK_CLASS} top-[4%]`}>
      <span className={WORDMARK_TEXT_CLASS}>argos</span>
    </div>
  );
}
