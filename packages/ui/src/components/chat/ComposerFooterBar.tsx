import ComposerModelPicker from "./ComposerModelPicker";
import ComposerEffortPicker from "./ComposerEffortPicker";
import ComposerModePicker from "./ComposerModePicker";
import { Separator } from "#shadcn/components/ui/separator";

const ComposerFooterBar = () => {
  return (
    <div className="flex items-center gap-1" data-testid="composer-footer-bar">
      <ComposerModelPicker />
      <Separator orientation="vertical" className="mx-1 h-4 bg-border/60" />
      <ComposerEffortPicker />
      <Separator orientation="vertical" className="mx-1 h-4 bg-border/60" />
      <ComposerModePicker />
    </div>
  );
};

export default ComposerFooterBar;
