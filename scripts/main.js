import data from '../assets/verses.json' assert { type: 'json' };

let versesDiv = document.getElementById("verses")


data.forEach(element => {
    let v = document.createElement("details")
    let r = document.createElement("summary")
    let p = document.createElement("div")
    p.textContent = element.verse
    r.textContent = element.reference
    v.appendChild(r)
    v.appendChild(p)
    versesDiv.appendChild(v)
});

const summaries = document.querySelectorAll('summary');

summaries.forEach(summary => {
    summary.addEventListener('click', closeOpenedDetails);
});

function closeOpenedDetails(){
    summaries.forEach(summary => {
        let detail = summary.parentNode;
            if(detail != this.parentNode){
                detail.removeAttribute('open')
            }
    });
}