type Program = {
  start: number
  end: number
  name: string
}

type Props = {
  program?: Program
  showLiveIndicator?: boolean
}

export default function ProgramDisplay({
  program,
}: Props) {
  if (!program) {
    return <span>אין מידע</span>
  }

  const startDate = new Date(program.start * 1000)
  const endDate = new Date(program.end * 1000)

  const start = startDate.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  const end = endDate.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })

  return (
    <span>
        <strong>
            {start}-{end}
        </strong>{" "}
        {program.name}
    </span>
  )
}
