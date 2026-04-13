import { useEffect, useState } from "react"
import { Channel, Program} from "@/lib/channels-data"

export function useCurrentProgram(programs?: Channel["programs"]) {
  const [currentProgram, setCurrentProgram] = useState<Program | null>(null)

  useEffect(() => {
    if (!programs) return

    const updateProgram = () => {
      const now = Math.floor(Date.now() / 1000)

      const program = programs.find(
        (p) => now >= p.start && now < p.end
      )

      setCurrentProgram(program || null)
    }

    updateProgram()

    const interval = setInterval(updateProgram, 30 * 1000)

    return () => clearInterval(interval)
  }, [programs])

  return currentProgram
}