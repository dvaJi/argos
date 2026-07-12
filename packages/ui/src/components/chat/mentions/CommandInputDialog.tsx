import { type FC, useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";

export interface CommandInputField {
  name: string;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
}

interface CommandInputDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  fields: CommandInputField[];
  onUpdateOpen: (open: boolean) => void;
  onSubmit: (values: Record<string, string>) => void;
}

const CommandInputDialog: FC<CommandInputDialogProps> = ({
  open,
  title,
  description,
  confirmText = "Confirm",
  fields,
  onUpdateOpen,
  onSubmit,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    const newValues: Record<string, string> = {};
    for (const field of fields) {
      newValues[field.name] = "";
    }
    setValues(newValues);
    setErrors({});
  }, [fields]);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, fields, resetForm]);

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {};
    for (const field of fields) {
      if (!field.required) continue;
      if (!values[field.name]?.trim()) {
        newErrors[field.name] = "This field is required.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [fields, values]);

  const submit = useCallback(() => {
    if (!validate()) return;
    onSubmit({ ...values });
  }, [validate, onSubmit, values]);

  const onEnter = useCallback(
    (fieldName: string) => {
      const index = fields.findIndex((field) => field.name === fieldName);
      if (index === fields.length - 1) {
        submit();
      }
    },
    [fields, submit],
  );

  return (
    <Dialog open={open} onOpenChange={onUpdateOpen}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1">
          <div className="space-y-3 py-2">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1">
                <Label htmlFor={field.name} className="text-sm font-medium">
                  {field.label || field.name}
                  {field.required && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id={field.name}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder || field.description || ""}
                  className={errors[field.name] ? "border-destructive" : ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onEnter(field.name);
                  }}
                />
                {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                {errors[field.name] && <p className="text-xs text-destructive">{errors[field.name]}</p>}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onUpdateOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CommandInputDialog;
