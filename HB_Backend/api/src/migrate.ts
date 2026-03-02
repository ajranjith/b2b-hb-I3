console.log("Running migrations...");

const proc = Bun.spawn(["bunx", "prisma", "migrate", "deploy"], {
  stdout: "inherit",
  stderr: "inherit",
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  const error = new Error(`prisma migrate deploy failed with exit code ${exitCode}`);
  console.error("Migration failed:", error);
  process.exit(exitCode);
}
