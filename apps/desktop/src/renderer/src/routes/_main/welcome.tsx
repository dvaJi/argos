import { createFileRoute } from "@tanstack/react-router";
import { WelcomePage } from "../../pages/WelcomePage";

export const Route = createFileRoute("/_main/welcome")({
  component: WelcomePage,
});
