import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import type { Schemas } from "~/lib/api/client"
import { dateTime } from "~/lib/format"

import { failureCount, isFailure, outcomeLabel, shortDevice } from "../attempts"

/** The last few sign-in tries, so an attempt you did not make is visible rather than silent. */
export function SignInActivity({
  security,
}: {
  security: Schemas["SecurityStatus"]
}) {
  const attempts = security.recent_attempts
  const failures = failureCount(attempts)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent sign-in attempts</CardTitle>
        <CardDescription>
          {attempts.length === 0
            ? "Nothing recorded yet."
            : failures === 0
              ? "No failed attempts recently."
              : `${failures} failed ${failures === 1 ? "attempt" : "attempts"} in the last few tries.`}
        </CardDescription>
      </CardHeader>
      {attempts.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="hidden sm:table-cell">From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {attempts.map((attempt, i) => (
                <TableRow key={`${attempt.at}-${i}`}>
                  <TableCell className="whitespace-nowrap">
                    {dateTime(attempt.at)}
                  </TableCell>
                  <TableCell
                    className={
                      isFailure(attempt.outcome)
                        ? "text-destructive"
                        : undefined
                    }
                  >
                    {outcomeLabel(attempt.outcome)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {attempt.client_ip} · {shortDevice(attempt.user_agent)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}
