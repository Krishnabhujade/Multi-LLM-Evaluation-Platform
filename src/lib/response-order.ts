/**
 * Keeps overlapping fetches from going back in time. Requests take a ticket in the order they
 * start; a response is accepted only if no newer request's response was accepted before it, so
 * a slow, older response can never overwrite fresher data that already arrived.
 */
export function createResponseOrder() {
  let issued = 0;
  let accepted = 0;
  return {
    /** Call when a request starts. */
    ticket: () => ++issued,
    /** Call when its response arrives; false means a newer response is already shown. */
    accept(ticket: number): boolean {
      if (ticket < accepted) return false;
      accepted = ticket;
      return true;
    },
  };
}
