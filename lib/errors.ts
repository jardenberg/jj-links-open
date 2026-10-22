export class ApiError extends Error {
  resetRequest = false;
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class WriteUncertainError extends Error {
  constructor(message = "Cloudflare may still be processing this change. Check its status using the same request before starting another write.") {
    super(message);
  }
}

export class WriteRejectedError extends Error {}
