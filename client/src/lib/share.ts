export function artifactShareToken(serverId: number): string {
  return `art_${serverId.toString(36)}`;
}

export function artifactSharePath(serverId: number): string {
  return `/share/${artifactShareToken(serverId)}`;
}
