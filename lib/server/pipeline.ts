import { access, appendFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { PipelineStatus } from "@/lib/types";
import { jobLogPath, outputsDir, rootDir } from "@/lib/server/paths";
import { updateJob } from "@/lib/server/jobs";

type PipelineStep = {
  status: PipelineStatus;
  command: string;
  args: string[];
};

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function pythonCommand() {
  const configured = process.env.PYTHON_BIN;
  if (configured) return configured;
  const venvPython = path.join(rootDir, ".venv", "bin", "python");
  if (await exists(venvPython)) return venvPython;
  return "python3";
}

async function modalCommand() {
  const configured = process.env.MODAL_BIN;
  if (configured) return configured;
  const venvModal = path.join(rootDir, ".venv", "bin", "modal");
  if (await exists(venvModal)) return venvModal;
  return "modal";
}

async function appendLog(id: string, message: string) {
  await mkdir(path.dirname(jobLogPath(id)), { recursive: true });
  await appendFile(jobLogPath(id), message);
}

function runCommand(id: string, step: PipelineStep) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      cwd: rootDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => void appendLog(id, chunk.toString()));
    child.stderr.on("data", (chunk) => void appendLog(id, chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${step.command} ${step.args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function validatePulledOutput(id: string) {
  const expected = path.join(outputsDir, id, "raw", `${id}.npz`);
  const info = await stat(expected).catch(() => null);
  if (!info?.isFile()) {
    throw new Error(`Modal output missing at outputs/${id}/raw/${id}.npz`);
  }
}

export async function startPipeline(id: string) {
  void runPipeline(id);
}

async function runPipeline(id: string) {
  const python = await pythonCommand();
  const modal = await modalCommand();
  const steps: PipelineStep[] = [
    {
      status: "brain_encoding",
      command: python,
      args: ["-m", "modal", "run", "modal_tribev2.py", "--reel", `reels/${id}.mp4`]
    },
    {
      status: "pulling_results",
      command: modal,
      args: ["volume", "get", "tribev2-outputs", id, "./outputs/", "--force"]
    },
    {
      status: "extracting_features",
      command: python,
      args: ["extract_features.py", id]
    },
    {
      status: "extracting_frames",
      command: python,
      args: ["extract_frames.py", id]
    },
    {
      status: "diagnosing",
      command: python,
      args: ["diagnose.py", id]
    },
    {
      status: "briefing",
      command: python,
      args: ["chat.py", id]
    }
  ];

  try {
    await appendLog(id, `[${new Date().toISOString()}] Starting TRIBE v2 pipeline for ${id}\n`);
    for (const step of steps) {
      await updateJob(id, { status: step.status });
      await appendLog(id, `\n[${new Date().toISOString()}] ${step.status}: ${step.command} ${step.args.join(" ")}\n`);
      await runCommand(id, step);
      if (step.status === "pulling_results") {
        await validatePulledOutput(id);
      }
    }
    await updateJob(id, { status: "completed" });
    await appendLog(id, `\n[${new Date().toISOString()}] Pipeline completed\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    await appendLog(id, `\n[${new Date().toISOString()}] ERROR: ${message}\n`);
    await updateJob(id, { status: "failed", error: message });
  }
}
