import { createFileRoute } from "@tanstack/react-router";
import { Inicio } from "../telas/Inicio";

export const Route = createFileRoute("/")({ component: Inicio });
