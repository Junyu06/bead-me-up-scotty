/** Extract a GitHub owner/repository slug, excluding credentials and URL metadata. */
export function githubRepo(remote: string): string {
  const match = /^(?:https:\/\/(?:[^/@]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match?.[1] ?? "";
}
