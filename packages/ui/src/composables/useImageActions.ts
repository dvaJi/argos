import { createFileClient } from "#api/FileClient";
import { useToast } from "#/components/use-toast";

export type ImageActionSource = {
  source: string;
  mimeType?: string;
  suggestedName?: string;
};

export function useImageActions() {
  const { toast } = useToast();
  const fileClient = createFileClient();

  const saveImage = async (image: ImageActionSource) => {
    try {
      const result = await fileClient.saveImage(image);
      if (result.canceled) {
        return;
      }

      toast({
        title: "Image saved",
        description: result.path,
      });
    } catch (error) {
      console.error("Failed to save image:", error);
      toast({
        title: "Failed to save image",
        variant: "destructive",
      });
    }
  };

  const copyImage = async (image: ImageActionSource) => {
    try {
      const result = await fileClient.copyImage(image);
      if (!result.copied) {
        throw new Error("Image was not copied");
      }

      toast({
        title: "Image copied",
        description: "Image has been copied to clipboard",
      });
    } catch (error) {
      console.error("Failed to copy image:", error);
      toast({
        title: "Copy failed",
        description: "Failed to copy image to clipboard",
        variant: "destructive",
      });
    }
  };

  return {
    saveImage,
    copyImage,
  };
}
