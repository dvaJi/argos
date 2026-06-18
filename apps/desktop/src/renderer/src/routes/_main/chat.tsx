import { createFileRoute } from "@tanstack/react-router";
import ChatTabView from "../../views/ChatTabView";

export const Route = createFileRoute("/_main/chat")({
  component: ChatTabView,
});
