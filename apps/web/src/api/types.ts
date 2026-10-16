import type { z } from "zod";
import type * as c from "@obey/contracts";

export type Me = c.Me;
export type User = c.User;
export type Relationship = c.Relationship;
export type Member = z.infer<typeof c.member>;
export type Role = c.Role;
export type ReschedulePolicy = z.infer<typeof c.reschedulePolicy>;
export type Invite = z.infer<typeof c.invite>;
export type Task = c.Task;
export type TaskInput = z.infer<typeof c.taskInput>;
export type Occurrence = c.Occurrence;
export type RescheduleInput = c.RescheduleInput;
export type RescheduleDayInput = c.RescheduleDayInput;
export type RescheduleRequest = c.RescheduleRequest;
export type LedgerEntry = c.LedgerEntry;
export type Balance = { userId: string; balance: number };
export type Reward = z.infer<typeof c.reward>;
export type RewardInput = z.infer<typeof c.rewardInput>;
export type Consequence = z.infer<typeof c.consequence>;
export type ConsequenceInput = z.infer<typeof c.consequenceInput>;
export type Rule = z.infer<typeof c.rule>;
export type RuleInput = z.infer<typeof c.ruleInput>;
export type Note = c.Note;
export type NoteInput = z.infer<typeof c.noteInput>;

export interface RescheduleResult {
  applied: boolean;
  request: RescheduleRequest | null;
  occurrence: Occurrence;
}

export interface LibraryTypes {
  rewards: { item: Reward; input: RewardInput };
  consequences: { item: Consequence; input: ConsequenceInput };
  rules: { item: Rule; input: RuleInput };
  notes: { item: Note; input: NoteInput };
}
export type LibraryKind = keyof LibraryTypes;
