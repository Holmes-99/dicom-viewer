// `npm run dist`: builds the Windows installer and portable exe (or, on a Mac, the dmg) into release/.
// The NSIS installer compiler cannot open files whose path is longer than 260 characters. When this folder
// sits deep on disk, the build runs through a temporary drive letter (subst) that is removed afterwards.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const run = (cmd, cwd = process.cwd()) => execSync(cmd, { stdio: 'inherit', cwd })
const target = process.platform === 'darwin' ? '--mac' : '--win'

run('npm run build')

if (process.platform !== 'win32' || process.cwd().length < 100) {
  run(`npx electron-builder ${target}`)
} else {
  const letter = 'VWXYZTSRQP'.split('').find((l) => !existsSync(`${l}:\\`))
  if (!letter) throw new Error('No free drive letter for the short build path; move the project to a shorter folder.')
  run(`subst ${letter}: "${process.cwd()}"`)
  try {
    run(`npx electron-builder ${target}`, `${letter}:\\`)
  } finally {
    run(`subst ${letter}: /D`)
  }
}
