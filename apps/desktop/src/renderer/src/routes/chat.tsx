import { createFileRoute } from "@tanstack/react-router";
import ChatTabView from "../views/ChatTabView";

export const Route = createFileRoute("/chat")({
  component: ChatTabView,
});
