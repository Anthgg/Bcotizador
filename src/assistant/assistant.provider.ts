import { Injectable } from "@nestjs/common";
import { AssistantContextDto } from "./assistant.dto";

export const ASSISTANT_PROVIDER = Symbol("ASSISTANT_PROVIDER");

export interface AssistantProvider {
  answer(input: {
    question: string;
    context: AssistantContextDto;
    knowledge: { title: string; content: string; version: number } | null;
  }): { text: string; resolved: boolean };
}

@Injectable()
export class DeterministicAssistantProvider implements AssistantProvider {
  answer(input: {
    question: string;
    context: AssistantContextDto;
    knowledge: { title: string; content: string; version: number } | null;
  }) {
    if (!input.knowledge) {
      return {
        text: "Todavía no tengo una respuesta verificada para esta consulta. Puedes registrarla como sugerencia para que ADMIN la revise antes de incorporarla al conocimiento oficial.",
        resolved: false,
      };
    }
    const page = input.context.step
      ? `${input.context.module} · ${input.context.step}`
      : input.context.module;
    return {
      text: `${input.knowledge.content}\n\nContexto: ${page}. Fuente: ${input.knowledge.title}, versión ${input.knowledge.version}.`,
      resolved: true,
    };
  }
}
