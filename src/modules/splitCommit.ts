import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { execSync } from 'child_process';
import { getDiff, getStagedFiles } from '../utils/git';

const openai = new OpenAI();

const Commit = z.object({
    files: z.array(z.string()),
    groupReason: z.string(),
});

const SplitCommits = z.object({
    commits: z.array(Commit),
});

const SYSTEM_PROMPT = `You are a senior engineer reviewing a junior developer's work.  
You will receive an output of 'git diff --staged' command and decide whether it should be split up into multiple commits.
If it should be split up, propose a way so that each file's changes appear in the same commit.  Never split up one file's changes across commits.`;

export async function splitCommit(diffContent: string) {
    const response = await openai.responses.parse({
        model: "gpt-4o-2024-08-06",
        input: [
            { role: "system", content: SYSTEM_PROMPT },
            {
                role: "user",
                content: diffContent,
            },
        ],
        text: {
            format: zodTextFormat(SplitCommits, "split_commits"),
        },
    });

    const commits = response.output_parsed;

    // Validate no duplicate files
    const allFiles = commits?.commits.flatMap(commit => commit.files) || [];
    const uniqueFiles = new Set(allFiles);
    const hasDuplicates = allFiles.length !== uniqueFiles.size;

    if (hasDuplicates) {
        const duplicates = allFiles.filter((file, index) => allFiles.indexOf(file) !== index);
        throw new Error(`AI response contains duplicate files: ${duplicates.join(', ')}. Each file should appear in exactly one commit.`);
    }

    return commits;
}

export async function getStagedDiff(): Promise<string> {
    const stagedFiles = await getStagedFiles();
    return getDiff({ files: stagedFiles });
} 