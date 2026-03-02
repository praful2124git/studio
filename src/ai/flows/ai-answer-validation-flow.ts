
'use server';
/**
 * @fileOverview A Genkit flow for validating user answers in the "Name Place Animal Thing" game.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

// Input Schema
const ValidateAnswersInputSchema = z.object({
  targetLetter: z.string().length(1).describe('The target letter for the round.'),
  name: z.string().optional().describe('The submitted word for the "Name" category.'),
  place: z.string().optional().describe('The submitted word for the "Place" category.'),
  animal: z.string().optional().describe('The submitted word for the "Animal" category.'),
  thing: z.string().optional().describe('The submitted word for the "Thing" category.'),
});
export type ValidateAnswersInput = z.infer<typeof ValidateAnswersInputSchema>;

// Validation Result Schema for a single category
const CategoryValidationResultSchema = z.object({
  isValid: z.boolean().describe('True if the word is valid according to the rules, false otherwise.'),
  reason: z.string().describe('Explanation for the validation result.'),
});

// Output Schema
const ValidateAnswersOutputSchema = z.object({
  nameValidation: CategoryValidationResultSchema.describe('Validation result for the "Name" category.'),
  placeValidation: CategoryValidationResultSchema.describe('Validation result for the "Place" category.'),
  animalValidation: CategoryValidationResultSchema.describe('Validation result for the "Animal" category.'),
  thingValidation: CategoryValidationResultSchema.describe('Validation result for the "Thing" category.'),
});
export type ValidateAnswersOutput = z.infer<typeof ValidateAnswersOutputSchema>;

// Prompt definition
const validateAnswersPrompt = ai.definePrompt({
  name: 'validateAnswersPrompt',
  input: {schema: ValidateAnswersInputSchema},
  output: {schema: ValidateAnswersOutputSchema},
  prompt: `You are an AI assistant for a word game called "Name Place Animal Thing".
Your task is to validate user-submitted words for the categories Name, Place, Animal, and Thing against a given target letter.
For each submitted word, you must determine if it is valid based on the following criteria:
1.  **Starts with Target Letter**: The word must begin with the provided 'targetLetter'. Case-insensitivity should be considered (e.g., 'apple' starts with 'A').
2.  **Valid for Category**: The word must be a plausible and appropriate answer for its respective category (Name, Place, Animal, or Thing).
3.  **Not Gibberish**: The word must be a real word and not random characters or nonsense.

The 'targetLetter' is: {{{targetLetter}}}

Here are the user's submissions:
Name: "{{{name}}}"
Place: "{{{place}}}"
Animal: "{{{animal}}}"
Thing: "{{{thing}}}"

Analyze each submission and provide a JSON object with validation results for each category.
If a word is empty, null, or undefined, it should be considered invalid with the reason "Empty submission."
The output MUST strictly follow the provided JSON schema.
`
});

// Flow definition
const validateAnswersFlow = ai.defineFlow(
  {
    name: 'validateAnswersFlow',
    inputSchema: ValidateAnswersInputSchema,
    outputSchema: ValidateAnswersOutputSchema,
  },
  async (input) => {
    const {output} = await validateAnswersPrompt(input);
    return output!;
  }
);

// Wrapper function
export async function validateAnswers(input: ValidateAnswersInput): Promise<ValidateAnswersOutput> {
  return validateAnswersFlow(input);
}
