const formatLocalISO = (date) => {
    const tzo = -date.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';

    const pad = (num) => String(num).padStart(2, '0');

    // Build the main date-time string
    const isoString = 
        date.getFullYear() + '-' +
        pad(date.getMonth() + 1) + '-' +
        pad(date.getDate()) + 'T' +
        pad(date.getHours()) + ':' +
        pad(date.getMinutes()) + ':' +
        pad(date.getSeconds());

    // Build the timezone offset string
    const offset = dif + pad(Math.floor(Math.abs(tzo) / 60)) + ':' + pad(Math.abs(tzo) % 60);

    return isoString + offset;
};

export {formatLocalISO}