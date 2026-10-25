/* "Get help" for signed-in students: the same guide as the home page Tools tab. */
import HelpGuide from '../components/HelpGuide'

export default function Help() {
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Get help</h1>
          <p>Four doors to the right people at Yale: career, academics, wellbeing, and international &amp; more.</p>
        </div>
      </div>
      <HelpGuide />
    </div>
  )
}
