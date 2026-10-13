import { createFileRoute } from "@tanstack/react-router";
import { TelaObra } from "../telas/obra/TelaObra";

export const Route = createFileRoute("/obra")({ component: TelaObra });
