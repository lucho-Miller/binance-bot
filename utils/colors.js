const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    
    // Colores regulares
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',

    // Fondo
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m'
}

// Funciones helper para los tipos de mensajes más comunes
const colorize = {
    error: (text) => `${colors.red}${text}${colors.reset}`,
    success: (text) => `${colors.green}${text}${colors.reset}`,
    warning: (text) => `${colors.yellow}${text}${colors.reset}`,
    info: (text) => `${colors.blue}${text}${colors.reset}`,
    price: (text) => `${colors.cyan}${text}${colors.reset}`,
    profit: (text) => `${colors.magenta}${text}${colors.reset}`,
    highlight: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`
}

module.exports = { colors, colorize }
