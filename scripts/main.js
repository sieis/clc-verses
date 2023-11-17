import data from '../assets/verses.json' assert { type: 'json' };

let versesDiv = document.getElementById("verses")


data.forEach(element => {
    let v = document.createElement("details")
    let r = document.createElement("summary")
    let esv = document.createElement("div")
    let niv = document.createElement("div")
    let nasb = document.createElement("div")
    esv.textContent = element.esv
    niv.textContent = element.niv
    nasb.textContent = element.nasb95
    r.textContent = element.reference
    v.appendChild(r)
    v.appendChild(esv).classList.add("esv")
    v.appendChild(niv).classList.add("niv")
    niv.setAttribute("hidden", true)
    v.appendChild(nasb).classList.add("nasb")
    nasb.setAttribute("hidden", true)
    versesDiv.appendChild(v)
});

const summaries = document.querySelectorAll('summary');
const esv = document.querySelectorAll(".esv")
const niv = document.querySelectorAll(".niv")
const nasb = document.querySelectorAll(".nasb")
const esvBtn = document.querySelector("#esv")
const nivBtn = document.querySelector("#niv")
const nasbBtn = document.querySelector("#nasb")
function showESV(){
    esv.forEach(e=>{
        e.removeAttribute("hidden")
    })
    niv.forEach(e=>{
        e.setAttribute("hidden",true)
    })
    nasb.forEach(e=>{
        e.setAttribute("hidden",true)
    })
}
function showNIV(){
    esv.forEach(e=>{
        e.setAttribute("hidden",true)
    })
    niv.forEach(e=>{
        e.removeAttribute("hidden")
    })
    nasb.forEach(e=>{
        e.setAttribute("hidden",true)
    })
}
function showNASB(){
    esv.forEach(e=>{
        e.setAttribute("hidden",true)
    })
    niv.forEach(e=>{
        e.setAttribute("hidden",true)
    })
    nasb.forEach(e=>{
        e.removeAttribute("hidden")
    })
}

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

esvBtn.addEventListener('click', showESV)
nivBtn.addEventListener('click', showNIV)
nasbBtn.addEventListener('click', showNASB)


